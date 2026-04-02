using System.Text.Json;
using Ledger.Domain.Exceptions;

namespace Ledger.Api.Middleware;

public class ExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;

    public ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception on {Method} {Path}", context.Request.Method, context.Request.Path);
            await WriteErrorAsync(context, ex);
        }
    }

    private static async Task WriteErrorAsync(HttpContext context, Exception ex)
    {
        var (statusCode, code, message) = ex switch
        {
            UnbalancedEntryException    => (400, "UNBALANCED_ENTRY",    ex.Message),
            ClosedPeriodException       => (400, "CLOSED_PERIOD",       ex.Message),
            DuplicateReversalException  => (400, "DUPLICATE_REVERSAL",  ex.Message),
            InvalidOperationException   => (400, "VALIDATION_ERROR",    ex.Message),
            KeyNotFoundException        => (404, "NOT_FOUND",           ex.Message),
            _                           => (500, "INTERNAL_ERROR",      "An unexpected error occurred.")
        };

        context.Response.StatusCode = statusCode;
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsync(JsonSerializer.Serialize(new { error = message, code }));
    }
}
