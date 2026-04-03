using Ledger.Domain.Interfaces;
using Ledger.Application.Interfaces;
using MediatR;

namespace Ledger.Application.Commands.PostJournalEntry;

public class PostJournalEntryHandler : IRequestHandler<PostJournalEntryCommand>
{
    private readonly IJournalEntryRepository _entries;
    private readonly IEventPublisher? _publisher;

    public PostJournalEntryHandler(IJournalEntryRepository entries, IEventPublisher? publisher = null)
    {
        _entries = entries;
        _publisher = publisher;
    }

    public async Task Handle(PostJournalEntryCommand request, CancellationToken cancellationToken)
    {
        var entry = await _entries.GetByIdAsync(request.EntryId, cancellationToken)
            ?? throw new InvalidOperationException($"Journal entry {request.EntryId} not found.");

        entry.Post(request.PostedByUserId);
        await _entries.SaveChangesAsync(cancellationToken);

        if (_publisher != null)
        {
            await _publisher.PublishAsync("chassis.ledger", "journal_entry.posted", new {
                TenantId = entry.TenantId,
                EntryId = entry.Id,
                TotalDebits = entry.TotalDebits,
                PostedAt = entry.PostedAt
            }, cancellationToken);
        }
    }
}
