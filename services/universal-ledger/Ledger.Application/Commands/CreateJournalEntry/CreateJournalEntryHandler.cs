using Ledger.Domain.Entities;
using Ledger.Domain.Enums;
using Ledger.Domain.Exceptions;
using Ledger.Domain.Interfaces;
using MediatR;

namespace Ledger.Application.Commands.CreateJournalEntry;

public class CreateJournalEntryHandler : IRequestHandler<CreateJournalEntryCommand, Guid>
{
    private readonly IJournalEntryRepository _entries;
    private readonly IFiscalPeriodRepository _periods;

    public CreateJournalEntryHandler(IJournalEntryRepository entries, IFiscalPeriodRepository periods)
    {
        _entries = entries;
        _periods = periods;
    }

    public async Task<Guid> Handle(CreateJournalEntryCommand request, CancellationToken cancellationToken)
    {
        if (request.PeriodId.HasValue)
        {
            var period = await _periods.GetByIdAsync(request.PeriodId.Value, cancellationToken);
            if (period == null)
                throw new InvalidOperationException($"Fiscal period {request.PeriodId} not found.");
            if (period.Status != PeriodStatus.Open)
                throw new ClosedPeriodException(request.PeriodId.Value);
        }

        var entry = JournalEntry.Create(request.TenantId, request.EntryDate, request.Description, request.Reference, request.PeriodId, request.SourceModule);

        foreach (var line in request.Lines)
            entry.AddLine(line.AccountId, line.DebitAmount, line.CreditAmount, line.Description);

        await _entries.AddAsync(entry, cancellationToken);
        await _entries.SaveChangesAsync(cancellationToken);
        return entry.Id;
    }
}
