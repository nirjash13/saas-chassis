namespace Ledger.Domain.Entities;

public class AccountTemplate
{
    // EF Core requires a parameterless constructor; use the factory method for domain creation.
    private AccountTemplate() { }

    public static AccountTemplate Create(string templateCode, string templateName, string accountsJson = "[]")
    {
        return new AccountTemplate
        {
            Id = Guid.NewGuid(),
            TemplateCode = templateCode,
            TemplateName = templateName,
            AccountsJson = accountsJson,
            CreatedAt = DateTime.UtcNow,
        };
    }

    public Guid Id { get; private set; } = Guid.NewGuid();
    public string TemplateCode { get; private set; } = string.Empty;
    public string TemplateName { get; private set; } = string.Empty;
    public string AccountsJson { get; private set; } = "[]";
    public DateTime CreatedAt { get; private set; } = DateTime.UtcNow;
}
