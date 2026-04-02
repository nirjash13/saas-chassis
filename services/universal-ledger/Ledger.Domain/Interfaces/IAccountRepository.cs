using Ledger.Domain.Entities;

namespace Ledger.Domain.Interfaces;

public interface IAccountRepository
{
    Task<Account?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<Account?> GetByCodeAsync(Guid tenantId, string code, CancellationToken ct = default);
    Task<List<Account>> GetAllByTenantAsync(Guid tenantId, CancellationToken ct = default);
    Task<AccountTemplate?> GetTemplateByCodeAsync(string templateCode, CancellationToken ct = default);
    Task AddAsync(Account account, CancellationToken ct = default);
    Task AddRangeAsync(IEnumerable<Account> accounts, CancellationToken ct = default);
    Task SaveChangesAsync(CancellationToken ct = default);
}
