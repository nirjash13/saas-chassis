using Ledger.Application.Commands.CreateJournalEntry;
using Ledger.Application.Commands.PostJournalEntry;
using Ledger.Application.Commands.ReverseJournalEntry;
using Ledger.Application.DTOs;
using Ledger.Domain.Enums;
using Ledger.Domain.Interfaces;
using MediatR;

namespace Ledger.Api.Endpoints;

public static class JournalEndpoints
{
    public static void Map(WebApplication app)
    {
        var group = app.MapGroup("/api/v1/ledger/entries");

        group.MapGet("/", async (IJournalEntryRepository entries, HttpContext ctx,
            string? fromDate, string? toDate, string? status) =>
        {
            var tenantId = GetTenantId(ctx);
            DateOnly? from   = fromDate != null ? DateOnly.Parse(fromDate) : null;
            DateOnly? to     = toDate   != null ? DateOnly.Parse(toDate)   : null;
            EntryStatus? st  = status   != null ? Enum.Parse<EntryStatus>(status, true) : null;
            var result = await entries.GetByTenantAsync(tenantId, from, to, st);
            return Results.Ok(result.Select(ToDto));
        });

        group.MapPost("/", async (CreateJournalEntryRequest req, IMediator mediator, HttpContext ctx) =>
        {
            var tenantId = GetTenantId(ctx);
            var lines = req.Lines.Select(l => new JournalLineRequest(l.AccountId, l.DebitAmount, l.CreditAmount, l.Description)).ToList();
            var id = await mediator.Send(new CreateJournalEntryCommand(tenantId, req.EntryDate, req.Description, req.Reference, req.PeriodId, req.SourceModule, lines));
            return Results.Created($"/api/v1/ledger/entries/{id}", new { id });
        });

        group.MapPost("/{id:guid}/post", async (Guid id, IMediator mediator, HttpContext ctx) =>
        {
            var userId = GetUserId(ctx);
            await mediator.Send(new PostJournalEntryCommand(id, userId));
            return Results.Ok(new { message = "Entry posted successfully." });
        });

        group.MapPost("/{id:guid}/reverse", async (Guid id, ReverseRequest req, IMediator mediator, HttpContext ctx) =>
        {
            var userId = GetUserId(ctx);
            var reversalId = await mediator.Send(new ReverseJournalEntryCommand(id, req.Reason, userId));
            return Results.Ok(new { reversalId });
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

    private static JournalEntryDto ToDto(Ledger.Domain.Entities.JournalEntry e) =>
        new(e.Id, e.TenantId, e.EntryDate, e.Description, e.Reference, e.Status, e.PeriodId,
            e.TotalDebits, e.TotalCredits, e.SourceModule, e.CreatedAt,
            e.Lines.Select(l => new JournalLineDto(l.Id, l.AccountId, null, null, l.DebitAmount, l.CreditAmount, l.Description)).ToList());
}

public record JournalLineReq(Guid AccountId, decimal DebitAmount, decimal CreditAmount, string? Description);
public record CreateJournalEntryRequest(DateOnly EntryDate, string Description, string? Reference, Guid? PeriodId, string? SourceModule, List<JournalLineReq> Lines);
public record ReverseRequest(string Reason);
