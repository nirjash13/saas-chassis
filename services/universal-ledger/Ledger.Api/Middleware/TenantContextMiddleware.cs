using Ledger.Application.Interfaces;

namespace Ledger.Api.Middleware;

/// <summary>
/// ASP.NET Core middleware that reads X-Tenant-ID, X-User-ID, and
/// X-Is-Platform-Admin headers (set by the API Gateway) and populates
/// the scoped ITenantContextAccessor for downstream EF Core interceptor.
/// </summary>
public class TenantContextMiddleware
{
    private readonly RequestDelegate _next;

    public TenantContextMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context, ITenantContextAccessor tenantContextAccessor)
    {
        // Allow health check through without gateway headers
        if (context.Request.Path.StartsWithSegments("/health"))
        {
            await _next(context);
            return;
        }

        var tenantId = context.Request.Headers["X-Tenant-ID"].FirstOrDefault();
        var userId = context.Request.Headers["X-User-ID"].FirstOrDefault();
        var isPlatformAdmin = context.Request.Headers["X-Is-Platform-Admin"].FirstOrDefault() == "true";

        if (string.IsNullOrEmpty(tenantId) && !isPlatformAdmin)
        {
            context.Response.StatusCode = 401;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsync("{\"error\":\"Missing gateway context headers.\",\"code\":\"UNAUTHORIZED\"}");
            return;
        }

        tenantContextAccessor.Set(new TenantContextInfo
        {
            TenantId = tenantId ?? "00000000-0000-0000-0000-000000000000",
            UserId = userId ?? string.Empty,
            IsPlatformAdmin = isPlatformAdmin,
        });

        await _next(context);
    }
}
