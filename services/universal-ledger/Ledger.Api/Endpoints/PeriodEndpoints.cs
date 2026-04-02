using Ledger.Application.Commands.CloseFiscalPeriod;
using Ledger.Application.Commands.CreateFiscalPeriod;
using Ledger.Domain.Interfaces;
using MediatR;

namespace Ledger.Api.Endpoints;

public static class PeriodEndpoints
{
    public static void Map(WebApplication app)
    {
        var group = app.MapGroup("/api/v1/ledger/periods");

        group.MapGet("/", async (IFiscalPeriodRepository periods, HttpContext ctx) =>
        {
            var tenantId = GetTenantId(ctx);
            var result = await periods.GetByTenantAsync(tenantId);
            return Results.Ok(result);
        });

        group.MapPost("/", async (CreatePeriodRequest req, IMediator mediator, HttpContext ctx) =>
        {
            var tenantId = GetTenantId(ctx);
            var id = await mediator.Send(new CreateFiscalPeriodCommand(tenantId, req.Name, req.StartDate, req.EndDate));
            return Results.Created($"/api/v1/ledger/periods/{id}", new { id });
        });

        group.MapPost("/{id:guid}/close", async (Guid id, IMediator mediator, HttpContext ctx) =>
        {
            var tenantId = GetTenantId(ctx);
            var userId   = GetUserId(ctx);
            await mediator.Send(new CloseFiscalPeriodCommand(id, tenantId, userId));
            return Results.Ok(new { message = "Period closed successfully." });
        });
    }

    private static Guid GetTenantId(HttpContext ctx)
    {
        var val = ctx.Request.Headers["X-Tenant-ID"].FirstOrDefault()
            ?? throw new InvalidOperationException("X-Tenant-ID header is required.");
        return Guid.Parse(val);
    }

    private static Guid GetUserId(HttpContext ctx)
    {
        var val = ctx.Request.Headers["X-User-ID"].FirstOrDefault()
            ?? throw new InvalidOperationException("X-User-ID header is required.");
        return Guid.Parse(val);
    }
}

public record CreatePeriodRequest(string Name, DateOnly StartDate, DateOnly EndDate);
