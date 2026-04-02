using Ledger.Domain.Interfaces;
using MediatR;

namespace Ledger.Application.Commands.PostJournalEntry;

public class PostJournalEntryHandler : IRequestHandler<PostJournalEntryCommand>
{
    private readonly IJournalEntryRepository _entries;

    public PostJournalEntryHandler(IJournalEntryRepository entries) => _entries = entries;

    public async Task Handle(PostJournalEntryCommand request, CancellationToken cancellationToken)
    {
        var entry = await _entries.GetByIdAsync(request.EntryId, cancellationToken)
            ?? throw new InvalidOperationException($"Journal entry {request.EntryId} not found.");

        entry.Post(request.PostedByUserId);
        await _entries.SaveChangesAsync(cancellationToken);
    }
}
