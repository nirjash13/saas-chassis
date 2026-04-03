namespace Ledger.Domain.Entities;

public class JournalLine
{
    // EF Core requires a parameterless constructor; use the factory method for domain creation.
    private JournalLine() { }

    public static JournalLine Create(
        Guid journalEntryId,
        Guid tenantId,
        Guid accountId,
        decimal debitAmount,
        decimal creditAmount,
        string? description = null)
    {
        return new JournalLine
        {
            Id = Guid.NewGuid(),
            JournalEntryId = journalEntryId,
            TenantId = tenantId,
            AccountId = accountId,
            DebitAmount = debitAmount,
            CreditAmount = creditAmount,
            Description = description,
            CreatedAt = DateTime.UtcNow,
        };
    }

    public Guid Id { get; private set; } = Guid.NewGuid();
    public Guid JournalEntryId { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid AccountId { get; private set; }
    public decimal DebitAmount { get; private set; }
    public decimal CreditAmount { get; private set; }
    public string? Description { get; private set; }
    public DateTime CreatedAt { get; private set; } = DateTime.UtcNow;

    // Navigation properties — left public for EF Core loading
    public JournalEntry? JournalEntry { get; set; }
    public Account? Account { get; set; }
}
