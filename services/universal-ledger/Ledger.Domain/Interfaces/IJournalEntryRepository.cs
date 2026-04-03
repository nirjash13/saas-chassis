using Ledger.Domain.Entities;
using Ledger.Domain.Enums;

namespace Ledger.Domain.Interfaces;

public interface IJournalEntryRepository
{
    Task<JournalEntry?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<List<JournalEntry>> GetByTenantAsync(Guid tenantId, DateOnly? fromDate = null, DateOnly? toDate = null, EntryStatus? status = null, Guid? accountId = null, CancellationToken ct = default);
    Task AddAsync(JournalEntry entry, CancellationToken ct = default);
    Task SaveChangesAsync(CancellationToken ct = default);
}
