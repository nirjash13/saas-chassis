using Ledger.Application.DTOs;
using MediatR;

namespace Ledger.Application.Queries.GetTrialBalance;

public record GetTrialBalanceQuery(Guid TenantId, DateOnly? AsOfDate = null) : IRequest<TrialBalanceDto>;
