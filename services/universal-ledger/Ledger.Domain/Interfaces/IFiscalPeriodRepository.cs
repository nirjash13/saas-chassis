using Ledger.Domain.Entities;

namespace Ledger.Domain.Interfaces;

public interface IFiscalPeriodRepository
{
    Task<FiscalPeriod?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<List<FiscalPeriod>> GetByTenantAsync(Guid tenantId, CancellationToken ct = default);
    Task<FiscalPeriod?> GetOpenPeriodForDateAsync(Guid tenantId, DateOnly date, CancellationToken ct = default);
    Task AddAsync(FiscalPeriod period, CancellationToken ct = default);
    Task SaveChangesAsync(CancellationToken ct = default);
}
