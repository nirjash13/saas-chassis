namespace Ledger.Domain.Exceptions;

public class UnbalancedEntryException : Exception
{
    public UnbalancedEntryException(Guid entryId, decimal totalDebits, decimal totalCredits)
        : base($"Journal entry {entryId} is unbalanced: debits={totalDebits:F4}, credits={totalCredits:F4}") { }
}
