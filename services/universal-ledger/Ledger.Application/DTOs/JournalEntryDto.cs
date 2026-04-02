using Ledger.Domain.Enums;

namespace Ledger.Application.DTOs;

public record JournalLineDto(
    Guid Id,
    Guid AccountId,
    string? AccountCode,
    string? AccountName,
    decimal DebitAmount,
    decimal CreditAmount,
    string? Description
);

public record JournalEntryDto(
    Guid Id,
    Guid TenantId,
    DateOnly EntryDate,
    string Description,
    string? Reference,
    EntryStatus Status,
    Guid? PeriodId,
    decimal TotalDebits,
    decimal TotalCredits,
    string? SourceModule,
    DateTime CreatedAt,
    List<JournalLineDto> Lines
);
