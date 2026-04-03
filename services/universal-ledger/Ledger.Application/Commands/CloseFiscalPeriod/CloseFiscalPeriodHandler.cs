using Ledger.Domain.Entities;
using Ledger.Domain.Enums;
using Ledger.Domain.Exceptions;
using Ledger.Domain.Interfaces;
using Ledger.Application.Interfaces;
using MediatR;

namespace Ledger.Application.Commands.CloseFiscalPeriod;

public class CloseFiscalPeriodHandler : IRequestHandler<CloseFiscalPeriodCommand>
{
    private readonly IFiscalPeriodRepository _periods;
    private readonly IJournalEntryRepository _entries;
    private readonly IAccountRepository _accounts;
    private readonly IEventPublisher? _publisher;

    public CloseFiscalPeriodHandler(IFiscalPeriodRepository periods, IJournalEntryRepository entries, IAccountRepository accounts, IEventPublisher? publisher = null)
    {
        _periods = periods;
        _entries = entries;
        _accounts = accounts;
        _publisher = publisher;
    }

    public async Task Handle(CloseFiscalPeriodCommand request, CancellationToken cancellationToken)
    {
        var period = await _periods.GetByIdAsync(request.PeriodId, cancellationToken)
            ?? throw new InvalidOperationException($"Fiscal period {request.PeriodId} not found.");

        if (period.Status != PeriodStatus.Open)
            throw new ClosedPeriodException(request.PeriodId);

        // 1. Get all entries in this period's date range
        var periodEntries = await _entries.GetByTenantAsync(
            request.TenantId,
            period.StartDate,
            period.EndDate,
            ct: cancellationToken);

        // 2. Verify no draft entries remain
        var draftCount = periodEntries.Count(e => e.Status == EntryStatus.Draft);
        if (draftCount > 0)
            throw new InvalidOperationException($"Cannot close period: {draftCount} unposted draft entries remain.");

        // 3. Compute balances from posted entries
        var postedLines = periodEntries
            .Where(e => e.Status == EntryStatus.Posted)
            .SelectMany(e => e.Lines)
            .ToList();

        var accountBalances = postedLines
            .GroupBy(l => l.AccountId)
            .ToDictionary(g => g.Key, g => (
                TotalDebits: g.Sum(l => l.DebitAmount),
                TotalCredits: g.Sum(l => l.CreditAmount)
            ));

        // 4. Find Retained Surplus account (code 3002)
        var allAccounts = await _accounts.GetAllByTenantAsync(request.TenantId, cancellationToken);
        var retainedSurplus = allAccounts.FirstOrDefault(a => a.Code == "3002" && a.IsActive)
            ?? throw new InvalidOperationException("Retained Surplus account (3002) not found. Cannot close period.");

        // 5. Build closing entry — zero out Revenue and Expense accounts
        var closingEntry = JournalEntry.Create(
            request.TenantId,
            period.EndDate,
            $"Period Closing Entry: {period.Name}",
            null,
            request.PeriodId,
            "period_close");

        decimal netIncome = 0;

        foreach (var account in allAccounts.Where(a => a.IsActive &&
            (a.AccountType == AccountType.Revenue || a.AccountType == AccountType.Expense)))
        {
            if (!accountBalances.TryGetValue(account.Id, out var balance)) continue;

            // netBalance = credits - debits
            // Revenue (credit-normal): positive = net credit; zero it with a debit
            // Expense (debit-normal): negative = net debit; zero it with a credit
            var netBalance = balance.TotalCredits - balance.TotalDebits;
            netIncome += netBalance; // Revenue positive adds to income; Expense negative reduces it

            if (netBalance > 0)
                closingEntry.AddLine(account.Id, netBalance, 0m, $"Close {account.Name}");
            else if (netBalance < 0)
                closingEntry.AddLine(account.Id, 0m, -netBalance, $"Close {account.Name}");
        }

        // 6. Post net income/loss to Retained Surplus
        if (netIncome > 0)
            closingEntry.AddLine(retainedSurplus.Id, 0m, netIncome, $"Net Income: {period.Name}");
        else if (netIncome < 0)
            closingEntry.AddLine(retainedSurplus.Id, -netIncome, 0m, $"Net Loss: {period.Name}");

        if (closingEntry.Lines.Any())
        {
            closingEntry.Post(request.ClosedByUserId);
            await _entries.AddAsync(closingEntry, cancellationToken);
        }

        // 7. Close the period
        period.Close(request.ClosedByUserId);

        // 8. Build opening balance entry for the next period (balance sheet accounts only)
        //    Revenue and Expense accounts were zeroed by the closing entry above.
        var nextPeriodStart = period.EndDate.AddDays(1);
        var openingEntry = JournalEntry.Create(
            request.TenantId,
            nextPeriodStart,
            $"Opening Balance: {period.Name}",
            null,
            null,
            "period_open");

        foreach (var account in allAccounts.Where(a => a.IsActive &&
            (a.AccountType == AccountType.Asset ||
             a.AccountType == AccountType.Liability ||
             a.AccountType == AccountType.Equity)))
        {
            if (!accountBalances.TryGetValue(account.Id, out var balance)) continue;

            var netBalance = balance.TotalDebits - balance.TotalCredits;

            // Asset (debit-normal): positive net debit carried forward as debit
            // Liability/Equity (credit-normal): positive net credit carried forward as credit
            if (account.AccountType == AccountType.Asset)
            {
                if (netBalance > 0)
                    openingEntry.AddLine(account.Id, netBalance, 0m, $"Opening balance: {account.Name}");
                else if (netBalance < 0)
                    openingEntry.AddLine(account.Id, 0m, -netBalance, $"Opening balance: {account.Name}");
            }
            else
            {
                var creditNet = balance.TotalCredits - balance.TotalDebits;
                if (creditNet > 0)
                    openingEntry.AddLine(account.Id, 0m, creditNet, $"Opening balance: {account.Name}");
                else if (creditNet < 0)
                    openingEntry.AddLine(account.Id, -creditNet, 0m, $"Opening balance: {account.Name}");
            }
        }

        if (openingEntry.Lines.Any() && openingEntry.IsBalanced)
        {
            openingEntry.Post(request.ClosedByUserId);
            await _entries.AddAsync(openingEntry, cancellationToken);
            period.SetOpeningBalanceEntry(openingEntry.Id);
        }

        await _entries.SaveChangesAsync(cancellationToken);

        if (_publisher != null)
        {
            await _publisher.PublishAsync("chassis.ledger", "fiscal_period.closed", new {
                TenantId = period.TenantId,
                PeriodId = period.Id,
                ClosedByUserId = request.ClosedByUserId,
                ClosedAt = DateTime.UtcNow
            }, cancellationToken);
        }
    }
}
