namespace Ledger.Domain.ValueObjects;

public sealed record AccountCode
{
    public string Value { get; }

    public AccountCode(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            throw new ArgumentException("Account code cannot be empty.", nameof(value));
        if (value.Length > 20)
            throw new ArgumentException("Account code cannot exceed 20 characters.", nameof(value));
        Value = value.Trim();
    }

    public override string ToString() => Value;

    public static implicit operator string(AccountCode code) => code.Value;
}
