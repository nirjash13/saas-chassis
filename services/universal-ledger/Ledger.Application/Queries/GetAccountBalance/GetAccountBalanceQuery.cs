using MediatR;

namespace Ledger.Application.Queries.GetAccountBalance;

public record AccountBalanceDto(Guid AccountId, string Code, string Name, decimal TotalDebits, decimal TotalCredits, decimal Balance);

public record GetAccountBalanceQuery(Guid TenantId, Guid AccountId, DateOnly? AsOfDate = null) : IRequest<AccountBalanceDto>;
