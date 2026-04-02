namespace Ledger.Domain.Exceptions;

public class DuplicateReversalException : Exception
{
    public DuplicateReversalException(Guid entryId)
        : base($"Journal entry {entryId} has already been reversed.") { }
}
