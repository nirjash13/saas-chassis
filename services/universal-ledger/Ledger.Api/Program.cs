using Ledger.Api.Endpoints;
using Ledger.Api.Middleware;
using Ledger.Application.Interfaces;
using Ledger.Infrastructure.Database;
using Ledger.Infrastructure.Messaging;
using Ledger.Infrastructure.Repositories;
using Ledger.Domain.Interfaces;
using Microsoft.EntityFrameworkCore;
using Serilog;
using Serilog.Events;

var builder = WebApplication.CreateBuilder(args);

// Serilog structured logging
Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Information()
    .MinimumLevel.Override("Microsoft", LogEventLevel.Warning)
    .MinimumLevel.Override("Microsoft.EntityFrameworkCore", LogEventLevel.Warning)
    .Enrich.FromLogContext()
    .WriteTo.Console(outputTemplate: "{Timestamp:yyyy-MM-dd HH:mm:ss} [{Level:u3}] {Message:lj}{NewLine}{Exception}")
    .WriteTo.Seq(builder.Configuration["SEQ_URL"] ?? "http://seq:5341")
    .CreateLogger();

builder.Host.UseSerilog();

// Tenant context (scoped per request)
builder.Services.AddScoped<TenantContextAccessor>();
builder.Services.AddScoped<ITenantContextAccessor>(sp => sp.GetRequiredService<TenantContextAccessor>());
builder.Services.AddScoped<TenantContextInterceptor>();

// EF Core with PostgreSQL and RLS interceptor
var connectionString = builder.Configuration["DATABASE_URL"]
    ?? throw new InvalidOperationException("DATABASE_URL environment variable is required.");

builder.Services.AddDbContext<LedgerDbContext>((sp, options) =>
{
    options.UseNpgsql(connectionString);
    options.AddInterceptors(sp.GetRequiredService<TenantContextInterceptor>());
});

// Repositories
builder.Services.AddScoped<IAccountRepository, AccountRepository>();
builder.Services.AddScoped<IJournalEntryRepository, JournalEntryRepository>();
builder.Services.AddScoped<IFiscalPeriodRepository, FiscalPeriodRepository>();

// MediatR — scan Application assembly for handlers
builder.Services.AddMediatR(cfg =>
    cfg.RegisterServicesFromAssembly(typeof(Ledger.Application.Commands.CreateAccount.CreateAccountCommand).Assembly));

// RabbitMQ publisher (optional — skip if not configured)
var rabbitUrl = builder.Configuration["RABBITMQ_URL"];
if (!string.IsNullOrEmpty(rabbitUrl))
{
    try
    {
        builder.Services.AddSingleton<IEventPublisher>(_ => new RabbitMqPublisher(rabbitUrl));
    }
    catch (Exception ex)
    {
        Log.Warning(ex, "RabbitMQ connection failed at startup — events will not be published.");
    }
}

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new() { Title = "Universal Ledger API", Version = "v1" });
});

var app = builder.Build();

// Middleware pipeline
app.UseMiddleware<ExceptionHandlingMiddleware>();
app.UseMiddleware<TenantContextMiddleware>();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Endpoint registration
AccountEndpoints.Map(app);
JournalEndpoints.Map(app);
PeriodEndpoints.Map(app);
ReportEndpoints.Map(app);

app.MapGet("/health", () => Results.Ok(new { status = "ok", service = "universal-ledger", version = "1.0.0" }));

app.Run();
