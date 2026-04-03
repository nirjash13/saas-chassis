using Ledger.Application.DTOs;
using Ledger.Domain.Enums;
using Ledger.Domain.Interfaces;
using MediatR;

namespace Ledger.Application.Queries.GetTrialBalance;

public class GetTrialBalanceHandler : IRequestHandler<GetTrialBalanceQuery, TrialBalanceDto>
{
    private readonly IAccountRepository _accounts;
    private readonly IJournalEntryRepository _entries;

    public GetTrialBalanceHandler(IAccountRepository accounts, IJournalEntryRepository entries)
    {
        _accounts = accounts;
        _entries = entries;
    }

    public async Task<TrialBalanceDto> Handle(GetTrialBalanceQuery request, CancellationToken cancellationToken)
    {
        var asOfDate = request.AsOfDate ?? DateOnly.FromDateTime(DateTime.UtcNow);
        var accounts = await _accounts.GetAllByTenantAsync(request.TenantId, cancellationToken);
        var entries = await _entries.GetByTenantAsync(request.TenantId, toDate: asOfDate, status: EntryStatus.Posted, ct: cancellationToken);

        var balances = entries
            .SelectMany(e => e.Lines)
            .GroupBy(l => l.AccountId)
            .ToDictionary(g => g.Key, g => (
                Debits: g.Sum(l => l.DebitAmount),
                Credits: g.Sum(l => l.CreditAmount)
            ));

        var lines = accounts
            .Select(a =>
            {
                var b = balances.GetValueOrDefault(a.Id);
                return new TrialBalanceLineDto(a.Id, a.Code, a.Name, a.AccountType, b.Debits, b.Credits, b.Debits - b.Credits);
            })
            .Where(l => l.TotalDebits != 0 || l.TotalCredits != 0)
            .OrderBy(l => l.AccountCode)
            .ToList();

        return new TrialBalanceDto(
            request.TenantId,
            asOfDate,
            lines,
            lines.Sum(l => l.TotalDebits),
            lines.Sum(l => l.TotalCredits));
    }
}
