using Ledger.Domain.Interfaces;
using MediatR;

namespace Ledger.Application.Commands.ReverseJournalEntry;

public class ReverseJournalEntryHandler : IRequestHandler<ReverseJournalEntryCommand, Guid>
{
    private readonly IJournalEntryRepository _entries;

    public ReverseJournalEntryHandler(IJournalEntryRepository entries) => _entries = entries;

    public async Task<Guid> Handle(ReverseJournalEntryCommand request, CancellationToken cancellationToken)
    {
        var entry = await _entries.GetByIdAsync(request.EntryId, cancellationToken)
            ?? throw new InvalidOperationException($"Journal entry {request.EntryId} not found.");

        var reversal = entry.CreateReversal(request.Reason, request.ReversedByUserId);
        await _entries.AddAsync(reversal, cancellationToken);
        await _entries.SaveChangesAsync(cancellationToken);
        return reversal.Id;
    }
}
