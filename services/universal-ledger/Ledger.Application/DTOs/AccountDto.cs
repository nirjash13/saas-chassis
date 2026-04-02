using Ledger.Domain.Enums;

namespace Ledger.Application.DTOs;

public record AccountDto(
    Guid Id,
    Guid TenantId,
    string Code,
    string Name,
    AccountType AccountType,
    Guid? ParentId,
    bool IsActive,
    string? Description,
    List<AccountDto>? Children = null
);
