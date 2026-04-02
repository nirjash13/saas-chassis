using Ledger.Domain.Entities;
using Ledger.Domain.Enums;
using Ledger.Domain.Interfaces;
using Ledger.Infrastructure.Database;
using Microsoft.EntityFrameworkCore;

namespace Ledger.Infrastructure.Repositories;

public class FiscalPeriodRepository : IFiscalPeriodRepository
{
    private readonly LedgerDbContext _context;

    public FiscalPeriodRepository(LedgerDbContext context) => _context = context;

    public async Task<FiscalPeriod?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        await _context.FiscalPeriods.FirstOrDefaultAsync(p => p.Id == id, ct);

    public async Task<List<FiscalPeriod>> GetByTenantAsync(Guid tenantId, CancellationToken ct = default) =>
        await _context.FiscalPeriods.Where(p => p.TenantId == tenantId).OrderBy(p => p.StartDate).ToListAsync(ct);

    public async Task<FiscalPeriod?> GetOpenPeriodForDateAsync(Guid tenantId, DateOnly date, CancellationToken ct = default) =>
        await _context.FiscalPeriods.FirstOrDefaultAsync(p =>
            p.TenantId == tenantId &&
            p.Status == PeriodStatus.Open &&
            p.StartDate <= date &&
            p.EndDate >= date, ct);

    public async Task AddAsync(FiscalPeriod period, CancellationToken ct = default) =>
        await _context.FiscalPeriods.AddAsync(period, ct);

    public async Task SaveChangesAsync(CancellationToken ct = default) =>
        await _context.SaveChangesAsync(ct);
}
