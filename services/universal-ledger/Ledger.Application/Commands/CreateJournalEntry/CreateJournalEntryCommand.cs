using MediatR;

namespace Ledger.Application.Commands.CreateJournalEntry;

public record JournalLineRequest(
    Guid AccountId,
    decimal DebitAmount,
    decimal CreditAmount,
    string? Description
);

public record CreateJournalEntryCommand(
    Guid TenantId,
    DateOnly EntryDate,
    string Description,
    string? Reference,
    Guid? PeriodId,
    string? SourceModule,
    List<JournalLineRequest> Lines
) : IRequest<Guid>;
