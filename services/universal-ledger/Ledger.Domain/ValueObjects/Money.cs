namespace Ledger.Domain.ValueObjects;

public sealed record Money(decimal Amount, string Currency = "BDT")
{
    public static Money Zero(string currency = "BDT") => new(0, currency);

    public static Money operator +(Money a, Money b)
    {
        if (a.Currency != b.Currency)
            throw new InvalidOperationException($"Cannot add amounts in different currencies: {a.Currency} and {b.Currency}");
        return new Money(a.Amount + b.Amount, a.Currency);
    }

    public static Money operator -(Money a, Money b)
    {
        if (a.Currency != b.Currency)
            throw new InvalidOperationException($"Cannot subtract amounts in different currencies: {a.Currency} and {b.Currency}");
        return new Money(a.Amount - b.Amount, a.Currency);
    }
}
