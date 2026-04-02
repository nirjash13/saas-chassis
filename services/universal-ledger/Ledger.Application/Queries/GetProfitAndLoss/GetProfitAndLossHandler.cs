using Ledger.Domain.Enums;
using Ledger.Domain.Interfaces;
using MediatR;

namespace Ledger.Application.Queries.GetProfitAndLoss;

public class GetProfitAndLossHandler : IRequestHandler<GetProfitAndLossQuery, ProfitAndLossDto>
{
    private readonly IAccountRepository _accounts;
    private readonly IJournalEntryRepository _entries;

    public GetProfitAndLossHandler(IAccountRepository accounts, IJournalEntryRepository entries)
    {
        _accounts = accounts;
        _entries = entries;
    }

    public async Task<ProfitAndLossDto> Handle(GetProfitAndLossQuery request, CancellationToken cancellationToken)
    {
        var accounts = await _accounts.GetAllByTenantAsync(request.TenantId, cancellationToken);
        var entries = await _entries.GetByTenantAsync(request.TenantId, request.FromDate, request.ToDate, EntryStatus.Posted, cancellationToken);

        // netBalance = credits - debits per account
        var balances = entries
            .SelectMany(e => e.Lines)
            .GroupBy(l => l.AccountId)
            .ToDictionary(g => g.Key, g => g.Sum(l => l.CreditAmount) - g.Sum(l => l.DebitAmount));

        var revenueLines = accounts
            .Where(a => a.AccountType == AccountType.Revenue)
            .Select(a => new PnLLineDto(a.Code, a.Name, balances.GetValueOrDefault(a.Id)))
            .Where(l => l.Amount != 0)
            .OrderBy(l => l.AccountCode)
            .ToList();

        // Expenses are debit-normal: debit > credit means negative netBalance, so negate for display
        var expenseLines = accounts
            .Where(a => a.AccountType == AccountType.Expense)
            .Select(a => new PnLLineDto(a.Code, a.Name, -balances.GetValueOrDefault(a.Id)))
            .Where(l => l.Amount != 0)
            .OrderBy(l => l.AccountCode)
            .ToList();

        var totalRevenue = revenueLines.Sum(l => l.Amount);
        var totalExpenses = expenseLines.Sum(l => l.Amount);

        return new ProfitAndLossDto(request.TenantId, request.FromDate, request.ToDate, revenueLines, expenseLines, totalRevenue, totalExpenses, totalRevenue - totalExpenses);
    }
}
