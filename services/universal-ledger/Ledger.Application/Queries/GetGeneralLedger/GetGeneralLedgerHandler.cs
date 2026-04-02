using Ledger.Application.DTOs;
using Ledger.Domain.Enums;
using Ledger.Domain.Interfaces;
using MediatR;

namespace Ledger.Application.Queries.GetGeneralLedger;

public class GetGeneralLedgerHandler : IRequestHandler<GetGeneralLedgerQuery, List<JournalEntryDto>>
{
    private readonly IJournalEntryRepository _entries;
    private readonly IAccountRepository _accounts;

    public GetGeneralLedgerHandler(IJournalEntryRepository entries, IAccountRepository accounts)
    {
        _entries = entries;
        _accounts = accounts;
    }

    public async Task<List<JournalEntryDto>> Handle(GetGeneralLedgerQuery request, CancellationToken cancellationToken)
    {
        var entries = await _entries.GetByTenantAsync(request.TenantId, request.FromDate, request.ToDate, EntryStatus.Posted, cancellationToken);
        var accounts = await _accounts.GetAllByTenantAsync(request.TenantId, cancellationToken);
        var accountMap = accounts.ToDictionary(a => a.Id);

        return entries
            .Where(e => e.Lines.Any(l => l.AccountId == request.AccountId))
            .OrderBy(e => e.EntryDate)
            .Select(e => new JournalEntryDto(
                e.Id,
                e.TenantId,
                e.EntryDate,
                e.Description,
                e.Reference,
                e.Status,
                e.PeriodId,
                e.TotalDebits,
                e.TotalCredits,
                e.SourceModule,
                e.CreatedAt,
                e.Lines.Select(l =>
                {
                    var acc = accountMap.GetValueOrDefault(l.AccountId);
                    return new JournalLineDto(l.Id, l.AccountId, acc?.Code, acc?.Name, l.DebitAmount, l.CreditAmount, l.Description);
                }).ToList()
            ))
            .ToList();
    }
}
