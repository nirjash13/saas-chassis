using System.Text.Json;
using Ledger.Domain.Entities;
using Ledger.Domain.Enums;
using Ledger.Domain.Interfaces;
using MediatR;

namespace Ledger.Application.Commands.InitializeFromTemplate;

public class InitializeFromTemplateHandler : IRequestHandler<InitializeFromTemplateCommand, int>
{
    private readonly IAccountRepository _accounts;

    public InitializeFromTemplateHandler(IAccountRepository accounts) => _accounts = accounts;

    public async Task<int> Handle(InitializeFromTemplateCommand request, CancellationToken cancellationToken)
    {
        var template = await _accounts.GetTemplateByCodeAsync(request.TemplateCode, cancellationToken)
            ?? throw new InvalidOperationException($"Template '{request.TemplateCode}' not found.");

        var templateEntries = JsonSerializer.Deserialize<List<TemplateAccountEntry>>(
            template.AccountsJson,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
            ?? throw new InvalidOperationException("Failed to parse template accounts.");

        var existing = await _accounts.GetAllByTenantAsync(request.TenantId, cancellationToken);
        var existingCodes = existing.Select(a => a.Code).ToHashSet();

        // Two-pass: parents first (no parentCode), then children
        var createdMap = new Dictionary<string, Guid>();
        var toCreate = new List<Account>();

        foreach (var entry in templateEntries.OrderBy(a => a.ParentCode == null ? 0 : 1).ThenBy(a => a.Code))
        {
            if (existingCodes.Contains(entry.Code)) continue;

            var accountType = entry.Type.ToLowerInvariant() switch
            {
                "asset"     => AccountType.Asset,
                "liability" => AccountType.Liability,
                "equity"    => AccountType.Equity,
                "revenue"   => AccountType.Revenue,
                "expense"   => AccountType.Expense,
                _           => throw new InvalidOperationException($"Unknown account type: {entry.Type}")
            };

            Guid? parentId = null;
            if (!string.IsNullOrEmpty(entry.ParentCode) && createdMap.TryGetValue(entry.ParentCode, out var pid))
                parentId = pid;

            var account = Account.Create(request.TenantId, entry.Code, entry.Name, accountType, parentId);
            createdMap[entry.Code] = account.Id;
            toCreate.Add(account);
        }

        if (toCreate.Count > 0)
        {
            await _accounts.AddRangeAsync(toCreate, cancellationToken);
            await _accounts.SaveChangesAsync(cancellationToken);
        }

        return toCreate.Count;
    }
}

internal class TemplateAccountEntry
{
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public string? ParentCode { get; set; }
}
