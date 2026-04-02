using Ledger.Domain.Entities;
using Ledger.Domain.Interfaces;
using Ledger.Infrastructure.Database;
using Microsoft.EntityFrameworkCore;

namespace Ledger.Infrastructure.Repositories;

public class AccountRepository : IAccountRepository
{
    private readonly LedgerDbContext _context;

    public AccountRepository(LedgerDbContext context) => _context = context;

    public async Task<Account?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        await _context.Accounts.Include(a => a.Children).FirstOrDefaultAsync(a => a.Id == id, ct);

    public async Task<Account?> GetByCodeAsync(Guid tenantId, string code, CancellationToken ct = default) =>
        await _context.Accounts.FirstOrDefaultAsync(a => a.TenantId == tenantId && a.Code == code, ct);

    public async Task<List<Account>> GetAllByTenantAsync(Guid tenantId, CancellationToken ct = default) =>
        await _context.Accounts.Where(a => a.TenantId == tenantId).OrderBy(a => a.Code).ToListAsync(ct);

    public async Task<AccountTemplate?> GetTemplateByCodeAsync(string templateCode, CancellationToken ct = default) =>
        await _context.AccountTemplates.FirstOrDefaultAsync(t => t.TemplateCode == templateCode, ct);

    public async Task AddAsync(Account account, CancellationToken ct = default) =>
        await _context.Accounts.AddAsync(account, ct);

    public async Task AddRangeAsync(IEnumerable<Account> accounts, CancellationToken ct = default) =>
        await _context.Accounts.AddRangeAsync(accounts, ct);

    public async Task SaveChangesAsync(CancellationToken ct = default) =>
        await _context.SaveChangesAsync(ct);
}
