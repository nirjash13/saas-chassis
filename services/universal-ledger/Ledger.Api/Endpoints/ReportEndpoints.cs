using Ledger.Application.Queries.GetGeneralLedger;
using Ledger.Application.Queries.GetProfitAndLoss;
using Ledger.Application.Queries.GetTrialBalance;
using Ledger.Domain.Enums;
using MediatR;

namespace Ledger.Api.Endpoints;

public static class ReportEndpoints
{
    public static void Map(WebApplication app)
    {
        var group = app.MapGroup("/api/v1/ledger/reports");

        group.MapGet("/trial-balance", async (IMediator mediator, HttpContext ctx, string? asOfDate) =>
        {
            var tenantId = GetTenantId(ctx);
            var asOf = asOfDate != null ? DateOnly.Parse(asOfDate) : (DateOnly?)null;
            return Results.Ok(await mediator.Send(new GetTrialBalanceQuery(tenantId, asOf)));
        });

        group.MapGet("/general-ledger", async (IMediator mediator, HttpContext ctx, Guid accountId, string? fromDate, string? toDate) =>
        {
            var tenantId = GetTenantId(ctx);
            DateOnly? from = fromDate != null ? DateOnly.Parse(fromDate) : null;
            DateOnly? to   = toDate   != null ? DateOnly.Parse(toDate)   : null;
            return Results.Ok(await mediator.Send(new GetGeneralLedgerQuery(tenantId, accountId, from, to)));
        });

        group.MapGet("/profit-loss", async (IMediator mediator, HttpContext ctx, string fromDate, string toDate) =>
        {
            var tenantId = GetTenantId(ctx);
            return Results.Ok(await mediator.Send(new GetProfitAndLossQuery(tenantId, DateOnly.Parse(fromDate), DateOnly.Parse(toDate))));
        });

        group.MapGet("/balance-sheet", async (IMediator mediator, HttpContext ctx, string? asOfDate) =>
        {
            var tenantId = GetTenantId(ctx);
            var asOf = asOfDate != null ? DateOnly.Parse(asOfDate) : DateOnly.FromDateTime(DateTime.UtcNow);
            var tb = await mediator.Send(new GetTrialBalanceQuery(tenantId, asOf));

            var assets      = tb.Lines.Where(l => l.AccountType == AccountType.Asset).ToList();
            var liabilities = tb.Lines.Where(l => l.AccountType == AccountType.Liability).ToList();
            var equity      = tb.Lines.Where(l => l.AccountType == AccountType.Equity).ToList();

            return Results.Ok(new
            {
                asOfDate = asOf,
                assets,
                liabilities,
                equity,
                totalAssets      = assets.Sum(l => l.Balance),
                totalLiabilities = liabilities.Sum(l => l.Balance),
                totalEquity      = equity.Sum(l => l.Balance)
            });
        });
    }

    private static Guid GetTenantId(HttpContext ctx)
    {
        var val = ctx.Request.Headers["X-Tenant-ID"].FirstOrDefault()
            ?? throw new InvalidOperationException("X-Tenant-ID header is required.");
        return Guid.Parse(val);
    }
}
