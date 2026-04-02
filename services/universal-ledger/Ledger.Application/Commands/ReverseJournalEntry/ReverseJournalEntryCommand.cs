using MediatR;

namespace Ledger.Application.Commands.ReverseJournalEntry;

public record ReverseJournalEntryCommand(Guid EntryId, string Reason, Guid ReversedByUserId) : IRequest<Guid>;
