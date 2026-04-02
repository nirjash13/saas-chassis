using MediatR;

namespace Ledger.Application.Commands.CloseFiscalPeriod;

public record CloseFiscalPeriodCommand(
    Guid PeriodId,
    Guid TenantId,
    Guid ClosedByUserId
) : IRequest;
