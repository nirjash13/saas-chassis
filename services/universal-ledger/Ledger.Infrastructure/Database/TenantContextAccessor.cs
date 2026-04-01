using Ledger.Application.Interfaces;

namespace Ledger.Infrastructure.Database;

/// <summary>
/// Thread-safe accessor for the current request's tenant context.
/// Registered as Scoped in DI so each request gets its own instance.
/// </summary>
public class TenantContextAccessor : ITenantContextAccessor
{
    private TenantContextInfo? _current;

    public TenantContextInfo? Current => _current;

    public void Set(TenantContextInfo context)
    {
        _current = context;
    }
}
