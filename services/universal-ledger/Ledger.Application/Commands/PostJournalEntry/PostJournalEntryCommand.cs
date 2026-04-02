using MediatR;

namespace Ledger.Application.Commands.PostJournalEntry;

public record PostJournalEntryCommand(Guid EntryId, Guid PostedByUserId) : IRequest;
