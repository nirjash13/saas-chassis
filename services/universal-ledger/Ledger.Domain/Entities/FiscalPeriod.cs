using Ledger.Domain.Enums;
using Ledger.Domain.Exceptions;

namespace Ledger.Domain.Entities;

public class FiscalPeriod
{
    public Guid Id { get; private set; } = Guid.NewGuid();
    public Guid TenantId { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public DateOnly StartDate { get; private set; }
    public DateOnly EndDate { get; private set; }
    public PeriodStatus Status { get; private set; } = PeriodStatus.Open;
    public Guid? ClosedBy { get; private set; }
    public DateTimeOffset? ClosedAt { get; private set; }
    public Guid? OpeningBalanceEntryId { get; private set; }
    public DateTime CreatedAt { get; private set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; private set; } = DateTime.UtcNow;

    private FiscalPeriod() { }

    public static FiscalPeriod Create(Guid tenantId, string name, DateOnly startDate, DateOnly endDate)
    {
        return new FiscalPeriod
        {
            TenantId = tenantId,
            Name = name,
            StartDate = startDate,
            EndDate = endDate,
        };
    }

    public void Close(Guid closedByUserId)
    {
        if (Status != PeriodStatus.Open)
            throw new ClosedPeriodException(Id);

        Status = PeriodStatus.Closed;
        ClosedBy = closedByUserId;
        ClosedAt = DateTimeOffset.UtcNow;
        UpdatedAt = DateTime.UtcNow;
    }

    public void SetOpeningBalanceEntry(Guid entryId)
    {
        OpeningBalanceEntryId = entryId;
        UpdatedAt = DateTime.UtcNow;
    }
}
