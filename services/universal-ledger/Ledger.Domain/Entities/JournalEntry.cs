using Ledger.Domain.Enums;
using Ledger.Domain.Exceptions;

namespace Ledger.Domain.Entities;

public class JournalEntry
{
    public Guid Id { get; private set; } = Guid.NewGuid();
    public Guid TenantId { get; private set; }
    public DateOnly EntryDate { get; private set; }
    public string Description { get; private set; } = string.Empty;
    public string? Reference { get; private set; }
    public EntryStatus Status { get; private set; } = EntryStatus.Draft;
    public Guid? PeriodId { get; private set; }
    public Guid? PostedBy { get; private set; }
    public DateTimeOffset? PostedAt { get; private set; }
    public Guid? ReversedById { get; private set; }
    public Guid? ReversalOfId { get; private set; }
    public string? SourceModule { get; private set; }
    public DateTime CreatedAt { get; private set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; private set; } = DateTime.UtcNow;

    public List<JournalLine> Lines { get; private set; } = new();

    public decimal TotalDebits => Lines.Sum(l => l.DebitAmount);
    public decimal TotalCredits => Lines.Sum(l => l.CreditAmount);
    public bool IsBalanced => TotalDebits == TotalCredits && TotalDebits > 0;

    private JournalEntry() { }

    public static JournalEntry Create(Guid tenantId, DateOnly entryDate, string description, string? reference = null, Guid? periodId = null, string? sourceModule = null)
    {
        return new JournalEntry
        {
            TenantId = tenantId,
            EntryDate = entryDate,
            Description = description,
            Reference = reference,
            PeriodId = periodId,
            SourceModule = sourceModule,
        };
    }

    public void AddLine(Guid accountId, decimal debitAmount, decimal creditAmount, string? description = null)
    {
        Lines.Add(new JournalLine
        {
            TenantId = TenantId,
            AccountId = accountId,
            DebitAmount = debitAmount,
            CreditAmount = creditAmount,
            Description = description,
        });
    }

    public void Post(Guid postedByUserId)
    {
        if (Status != EntryStatus.Draft)
            throw new InvalidOperationException("Only draft entries can be posted.");
        if (!IsBalanced)
            throw new UnbalancedEntryException(Id, TotalDebits, TotalCredits);

        Status = EntryStatus.Posted;
        PostedBy = postedByUserId;
        PostedAt = DateTimeOffset.UtcNow;
        UpdatedAt = DateTime.UtcNow;
    }

    public JournalEntry CreateReversal(string reason, Guid reversedByUserId)
    {
        if (Status != EntryStatus.Posted)
            throw new InvalidOperationException("Only posted entries can be reversed.");
        if (ReversedById.HasValue)
            throw new DuplicateReversalException(Id);

        var reversal = new JournalEntry
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            EntryDate = DateOnly.FromDateTime(DateTime.UtcNow),
            Description = $"REVERSAL: {Description} — {reason}",
            Reference = Reference,
            Status = EntryStatus.Posted,
            ReversalOfId = Id,
            PostedBy = reversedByUserId,
            PostedAt = DateTimeOffset.UtcNow,
        };

        foreach (var line in Lines)
        {
            reversal.Lines.Add(new JournalLine
            {
                TenantId = TenantId,
                AccountId = line.AccountId,
                DebitAmount = line.CreditAmount,
                CreditAmount = line.DebitAmount,
                Description = $"Reversal of: {line.Description}",
            });
        }

        Status = EntryStatus.Reversed;
        ReversedById = reversal.Id;
        UpdatedAt = DateTime.UtcNow;

        return reversal;
    }
}
