using Ledger.Domain.Enums;

namespace Ledger.Application.DTOs;

public record TrialBalanceLineDto(
    Guid AccountId,
    string AccountCode,
    string AccountName,
    AccountType AccountType,
    decimal TotalDebits,
    decimal TotalCredits,
    decimal Balance
);

public record TrialBalanceDto(
    Guid TenantId,
    DateOnly AsOfDate,
    List<TrialBalanceLineDto> Lines,
    decimal TotalDebits,
    decimal TotalCredits
);
