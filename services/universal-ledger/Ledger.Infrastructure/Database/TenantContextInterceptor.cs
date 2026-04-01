using System.Data.Common;
using Ledger.Application.Interfaces;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Ledger.Infrastructure.Database;

/// <summary>
/// EF Core interceptor that prepends SET LOCAL commands to every SQL query,
/// enabling PostgreSQL Row-Level Security for tenant isolation.
/// </summary>
public class TenantContextInterceptor : DbCommandInterceptor
{
    private readonly ITenantContextAccessor _tenantContext;

    public TenantContextInterceptor(ITenantContextAccessor tenantContext)
    {
        _tenantContext = tenantContext;
    }

    public override InterceptionResult<DbDataReader> ReaderExecuting(
        DbCommand command,
        CommandEventData eventData,
        InterceptionResult<DbDataReader> result)
    {
        SetTenantContext(command);
        return result;
    }

    public override InterceptionResult<int> NonQueryExecuting(
        DbCommand command,
        CommandEventData eventData,
        InterceptionResult<int> result)
    {
        SetTenantContext(command);
        return result;
    }

    public override InterceptionResult<object> ScalarExecuting(
        DbCommand command,
        CommandEventData eventData,
        InterceptionResult<object> result)
    {
        SetTenantContext(command);
        return result;
    }

    public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
        DbCommand command,
        CommandEventData eventData,
        InterceptionResult<DbDataReader> result,
        CancellationToken cancellationToken = default)
    {
        SetTenantContext(command);
        return new ValueTask<InterceptionResult<DbDataReader>>(result);
    }

    public override ValueTask<InterceptionResult<int>> NonQueryExecutingAsync(
        DbCommand command,
        CommandEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        SetTenantContext(command);
        return new ValueTask<InterceptionResult<int>>(result);
    }

    private void SetTenantContext(DbCommand command)
    {
        var context = _tenantContext.Current;
        if (context == null) return;

        var prefix = $"SET LOCAL app.current_tenant_id = '{context.TenantId}';" +
                     $"SET LOCAL app.is_platform_admin = '{context.IsPlatformAdmin.ToString().ToLower()}';\n";

        command.CommandText = prefix + command.CommandText;
    }
}
