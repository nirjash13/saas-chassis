namespace Ledger.Domain.Entities;

public class AccountTemplate
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string TemplateCode { get; set; } = string.Empty;
    public string TemplateName { get; set; } = string.Empty;
    public string AccountsJson { get; set; } = "[]";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
