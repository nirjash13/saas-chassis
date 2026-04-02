using Ledger.Domain.Enums;

namespace Ledger.Domain.Entities;

public class Account
{
    public Guid Id { get; private set; } = Guid.NewGuid();
    public Guid TenantId { get; private set; }
    public string Code { get; private set; } = string.Empty;
    public string Name { get; private set; } = string.Empty;
    public AccountType AccountType { get; private set; }
    public Guid? ParentId { get; private set; }
    public bool IsActive { get; private set; } = true;
    public string? Description { get; private set; }
    public DateTime CreatedAt { get; private set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; private set; } = DateTime.UtcNow;

    public Account? Parent { get; private set; }
    public List<Account> Children { get; private set; } = new();

    private Account() { }

    public static Account Create(Guid tenantId, string code, string name, AccountType accountType, Guid? parentId = null, string? description = null)
    {
        return new Account
        {
            TenantId = tenantId,
            Code = code,
            Name = name,
            AccountType = accountType,
            ParentId = parentId,
            Description = description,
        };
    }

    public void Update(string name, string? description, bool isActive)
    {
        Name = name;
        Description = description;
        IsActive = isActive;
        UpdatedAt = DateTime.UtcNow;
    }
}
