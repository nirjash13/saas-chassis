FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY *.sln .
COPY Ledger.Api/*.csproj Ledger.Api/
COPY Ledger.Domain/*.csproj Ledger.Domain/
COPY Ledger.Application/*.csproj Ledger.Application/
COPY Ledger.Infrastructure/*.csproj Ledger.Infrastructure/
RUN dotnet restore

COPY . .
RUN dotnet publish Ledger.Api -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app .
EXPOSE 3006
ENV ASPNETCORE_URLS=http://+:3006
ENTRYPOINT ["dotnet", "Ledger.Api.dll"]
