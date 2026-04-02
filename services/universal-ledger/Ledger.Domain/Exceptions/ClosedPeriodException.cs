namespace Ledger.Domain.Exceptions;

public class ClosedPeriodException : Exception
{
    public ClosedPeriodException(Guid periodId)
        : base($"Fiscal period {periodId} is closed and cannot accept new entries.") { }
}
