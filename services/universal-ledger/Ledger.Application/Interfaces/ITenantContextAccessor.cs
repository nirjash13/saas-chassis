namespace Ledger.Application.Interfaces;

public class TenantContextInfo
{
    public required string TenantId { get; init; }
    public required string UserId { get; init; }
    public required bool IsPlatformAdmin { get; init; }
}

public interface ITenantContextAccessor
{
    TenantContextInfo? Current { get; }
    void Set(TenantContextInfo context);
}
