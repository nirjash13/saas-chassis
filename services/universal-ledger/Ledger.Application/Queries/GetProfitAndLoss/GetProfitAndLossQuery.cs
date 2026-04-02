using MediatR;

namespace Ledger.Application.Queries.GetProfitAndLoss;

public record PnLLineDto(string AccountCode, string AccountName, decimal Amount);

public record ProfitAndLossDto(
    Guid TenantId,
    DateOnly FromDate,
    DateOnly ToDate,
    List<PnLLineDto> Revenue,
    List<PnLLineDto> Expenses,
    decimal TotalRevenue,
    decimal TotalExpenses,
    decimal NetIncome
);

public record GetProfitAndLossQuery(Guid TenantId, DateOnly FromDate, DateOnly ToDate) : IRequest<ProfitAndLossDto>;
