using Ledger.Domain.Entities;
using Ledger.Domain.Enums;
using Ledger.Domain.Interfaces;
using Ledger.Infrastructure.Database;
using Microsoft.EntityFrameworkCore;

namespace Ledger.Infrastructure.Repositories;

public class JournalEntryRepository : IJournalEntryRepository
{
    private readonly LedgerDbContext _context;

    public JournalEntryRepository(LedgerDbContext context) => _context = context;

    public async Task<JournalEntry?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        await _context.JournalEntries.Include(e => e.Lines).FirstOrDefaultAsync(e => e.Id == id, ct);

    public async Task<List<JournalEntry>> GetByTenantAsync(
        Guid tenantId,
        DateOnly? fromDate = null,
        DateOnly? toDate = null,
        EntryStatus? status = null,
        CancellationToken ct = default)
    {
        var query = _context.JournalEntries
            .Include(e => e.Lines)
            .Where(e => e.TenantId == tenantId);

        if (fromDate.HasValue) query = query.Where(e => e.EntryDate >= fromDate.Value);
        if (toDate.HasValue)   query = query.Where(e => e.EntryDate <= toDate.Value);
        if (status.HasValue)   query = query.Where(e => e.Status == status.Value);

        return await query.OrderBy(e => e.EntryDate).ToListAsync(ct);
    }

    public async Task AddAsync(JournalEntry entry, CancellationToken ct = default) =>
        await _context.JournalEntries.AddAsync(entry, ct);

    public async Task SaveChangesAsync(CancellationToken ct = default) =>
        await _context.SaveChangesAsync(ct);
}
