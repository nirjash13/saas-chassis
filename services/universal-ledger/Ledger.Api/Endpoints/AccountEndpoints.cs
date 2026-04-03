using Ledger.Application.Commands.CreateAccount;
using Ledger.Application.Commands.InitializeFromTemplate;
using Ledger.Application.DTOs;
using Ledger.Domain.Enums;
using Ledger.Domain.Interfaces;
using MediatR;

namespace Ledger.Api.Endpoints;

public static class AccountEndpoints
{
    public static void Map(WebApplication app)
    {
        var group = app.MapGroup("/api/v1/ledger/accounts");

        group.MapGet("/", async (IAccountRepository accounts, HttpContext ctx) =>
        {
            var tenantId = GetTenantId(ctx);
            var all = await accounts.GetAllByTenantAsync(tenantId);

            var dtoMap = all.ToDictionary(a => a.Id, a => new AccountDto(
                a.Id, a.TenantId, a.Code, a.Name, a.AccountType, a.ParentId, a.IsActive, a.Description,
                new List<AccountDto>()
            ));

            var roots = new List<AccountDto>();
            foreach (var dto in dtoMap.Values)
            {
                if (dto.ParentId.HasValue && dtoMap.TryGetValue(dto.ParentId.Value, out var parent))
                    parent.Children!.Add(dto);
                else
                    roots.Add(dto);
            }

            return Results.Ok(roots);
        });

        group.MapPost("/", async (CreateAccountRequest req, IMediator mediator, HttpContext ctx) =>
        {
            var tenantId = GetTenantId(ctx);
            var id = await mediator.Send(new CreateAccountCommand(tenantId, req.Code, req.Name, req.AccountType, req.ParentId, req.Description));
            return Results.Created($"/api/v1/ledger/accounts/{id}", new { id });
        });

        group.MapPost("/from-template", async (FromTemplateRequest req, IMediator mediator, HttpContext ctx) =>
        {
            var tenantId = GetTenantId(ctx);
            var count = await mediator.Send(new InitializeFromTemplateCommand(tenantId, req.TemplateCode));
            return Results.Ok(new { accountsCreated = count });
        });

        group.MapPatch("/{id:guid}", async (Guid id, UpdateAccountRequest req, IAccountRepository accounts) =>
        {
            var account = await accounts.GetByIdAsync(id);
            if (account == null) return Results.NotFound();
            account.Update(req.Name, req.Description, req.IsActive);
            await accounts.SaveChangesAsync();
            return Results.Ok(ToDto(account));
        });
    }

    private static Guid GetTenantId(HttpContext ctx)
    {
        var val = ctx.Request.Headers["X-Tenant-ID"].FirstOrDefault()
            ?? throw new InvalidOperationException("X-Tenant-ID header is required.");
        return Guid.Parse(val);
    }

    private static AccountDto ToDto(Ledger.Domain.Entities.Account a) =>
        new(a.Id, a.TenantId, a.Code, a.Name, a.AccountType, a.ParentId, a.IsActive, a.Description);
}

public record CreateAccountRequest(string Code, string Name, AccountType AccountType, Guid? ParentId, string? Description);
public record UpdateAccountRequest(string Name, string? Description, bool IsActive);
public record FromTemplateRequest(string TemplateCode);
