namespace Ledger.Domain.Entities;

public class JournalLine
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid JournalEntryId { get; set; }
    public Guid TenantId { get; set; }
    public Guid AccountId { get; set; }
    public decimal DebitAmount { get; set; }
    public decimal CreditAmount { get; set; }
    public string? Description { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public JournalEntry? JournalEntry { get; set; }
    public Account? Account { get; set; }
}
