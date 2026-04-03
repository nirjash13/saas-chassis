using Ledger.Domain.Enums;

namespace Ledger.Application.DTOs;

public record FiscalPeriodDto(
    Guid Id,
    Guid TenantId,
    string Name,
    DateOnly StartDate,
    DateOnly EndDate,
    PeriodStatus Status,
    Guid? ClosedBy,
    DateTimeOffset? ClosedAt,
    Guid? OpeningBalanceEntryId,
    DateTime CreatedAt,
    DateTime UpdatedAt
);
