using Ledger.Application.DTOs;
using MediatR;

namespace Ledger.Application.Queries.GetGeneralLedger;

public record GetGeneralLedgerQuery(
    Guid TenantId,
    Guid AccountId,
    DateOnly? FromDate = null,
    DateOnly? ToDate = null
) : IRequest<List<JournalEntryDto>>;
