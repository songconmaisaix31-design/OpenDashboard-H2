[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Analytics', 'Web')]
  [string] $Role,

  [Parameter(Mandatory = $true)]
  [ValidateRange(1024, 65535)]
  [int] $Port,

  [ValidateSet('dev', 'preview')]
  [string] $WebRuntime = 'dev'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$nativeSource = @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

public static class H2SentinelOwnedProcess
{
    private const uint CREATE_SUSPENDED = 0x00000004;
    private const uint INFINITE = 0xffffffff;
    private const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;
    private const int JobObjectExtendedLimitInformation = 9;

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_BASIC_LIMIT_INFORMATION
    {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct IO_COUNTERS
    {
        public ulong ReadOperationCount;
        public ulong WriteOperationCount;
        public ulong OtherOperationCount;
        public ulong ReadTransferCount;
        public ulong WriteTransferCount;
        public ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
    {
        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
        public IO_COUNTERS IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct STARTUPINFO
    {
        public int cb;
        public string lpReserved;
        public string lpDesktop;
        public string lpTitle;
        public int dwX;
        public int dwY;
        public int dwXSize;
        public int dwYSize;
        public int dwXCountChars;
        public int dwYCountChars;
        public int dwFillAttribute;
        public int dwFlags;
        public short wShowWindow;
        public short cbReserved2;
        public IntPtr lpReserved2;
        public IntPtr hStdInput;
        public IntPtr hStdOutput;
        public IntPtr hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct PROCESS_INFORMATION
    {
        public IntPtr hProcess;
        public IntPtr hThread;
        public uint dwProcessId;
        public uint dwThreadId;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateJobObject(IntPtr securityAttributes, string name);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetInformationJobObject(
        IntPtr job,
        int informationClass,
        IntPtr information,
        uint informationLength);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CreateProcess(
        string applicationName,
        StringBuilder commandLine,
        IntPtr processAttributes,
        IntPtr threadAttributes,
        bool inheritHandles,
        uint creationFlags,
        IntPtr environment,
        string currentDirectory,
        ref STARTUPINFO startupInfo,
        out PROCESS_INFORMATION processInformation);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint ResumeThread(IntPtr thread);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetExitCodeProcess(IntPtr process, out uint exitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool TerminateProcess(IntPtr process, uint exitCode);

    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(IntPtr handle);

    public static int Run(string role, string executable, string[] arguments, string workingDirectory)
    {
        IntPtr job = IntPtr.Zero;
        IntPtr information = IntPtr.Zero;
        PROCESS_INFORMATION process = new PROCESS_INFORMATION();

        try
        {
            job = CreateJobObject(IntPtr.Zero, null);
            if (job == IntPtr.Zero) ThrowLastError("CreateJobObject");

            var limits = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            int informationLength = Marshal.SizeOf(limits);
            information = Marshal.AllocHGlobal(informationLength);
            Marshal.StructureToPtr(limits, information, false);
            if (!SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                information,
                (uint)informationLength))
            {
                ThrowLastError("SetInformationJobObject");
            }

            var startup = new STARTUPINFO();
            startup.cb = Marshal.SizeOf(startup);
            var commandLine = new StringBuilder(BuildCommandLine(executable, arguments));
            if (!CreateProcess(
                executable,
                commandLine,
                IntPtr.Zero,
                IntPtr.Zero,
                true,
                CREATE_SUSPENDED,
                IntPtr.Zero,
                workingDirectory,
                ref startup,
                out process))
            {
                ThrowLastError("CreateProcess");
            }

            if (!AssignProcessToJobObject(job, process.hProcess))
            {
                int error = Marshal.GetLastWin32Error();
                TerminateProcess(process.hProcess, 1);
                throw new Win32Exception(error, "AssignProcessToJobObject failed");
            }

            Console.Out.WriteLine("[H2_SENTINEL_OWNED_PID] " + role + " " + process.dwProcessId);
            Console.Out.Flush();
            if (ResumeThread(process.hThread) == uint.MaxValue)
            {
                int error = Marshal.GetLastWin32Error();
                TerminateProcess(process.hProcess, 1);
                throw new Win32Exception(error, "ResumeThread failed");
            }
            if (WaitForSingleObject(process.hProcess, INFINITE) != 0)
            {
                ThrowLastError("WaitForSingleObject");
            }
            uint exitCode;
            if (!GetExitCodeProcess(process.hProcess, out exitCode))
            {
                ThrowLastError("GetExitCodeProcess");
            }
            Console.Out.WriteLine(
                "[H2_SENTINEL_OWNED_EXIT] " + role + " " + process.dwProcessId + " " + exitCode);
            Console.Out.Flush();
            return unchecked((int)exitCode);
        }
        finally
        {
            if (information != IntPtr.Zero) Marshal.FreeHGlobal(information);
            if (process.hThread != IntPtr.Zero) CloseHandle(process.hThread);
            if (process.hProcess != IntPtr.Zero) CloseHandle(process.hProcess);
            if (job != IntPtr.Zero) CloseHandle(job);
        }
    }

    private static void ThrowLastError(string operation)
    {
        throw new Win32Exception(Marshal.GetLastWin32Error(), operation + " failed");
    }

    private static string BuildCommandLine(string executable, string[] arguments)
    {
        var result = new StringBuilder(QuoteArgument(executable));
        foreach (string argument in arguments)
        {
            result.Append(' ');
            result.Append(QuoteArgument(argument));
        }
        return result.ToString();
    }

    private static string QuoteArgument(string value)
    {
        if (value.Length > 0 && value.IndexOfAny(new[] { ' ', '\t', '"' }) < 0) return value;

        var result = new StringBuilder("\"");
        int backslashes = 0;
        foreach (char character in value)
        {
            if (character == '\\')
            {
                backslashes += 1;
                continue;
            }
            if (character == '"')
            {
                result.Append('\\', backslashes * 2 + 1);
                result.Append('"');
                backslashes = 0;
                continue;
            }
            result.Append('\\', backslashes);
            backslashes = 0;
            result.Append(character);
        }
        result.Append('\\', backslashes * 2);
        result.Append('"');
        return result.ToString();
    }
}
'@

Add-Type -TypeDefinition $nativeSource -Language CSharp

$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
if ($Role -eq 'Analytics') {
  $executable = (Get-Command uv.exe -ErrorAction Stop).Source
  $workingDirectory = Join-Path $repositoryRoot 'services\h2-analytics'
  $childArguments = @(
    'run', '--locked', '--extra', 'dev', 'python', '-m', 'h2_analytics',
    '--port', [string] $Port
  )
} else {
  $self = Get-CimInstance Win32_Process -Filter "ProcessId = $PID"
  $parent = Get-CimInstance Win32_Process -Filter "ProcessId = $($self.ParentProcessId)"
  if (-not $parent -or -not $parent.ExecutablePath) {
    throw 'Unable to resolve the fixed parent Node executable.'
  }
  $executable = $parent.ExecutablePath
  $workingDirectory = $repositoryRoot
  $viteEntry = Join-Path $repositoryRoot 'node_modules\vite\bin\vite.js'
  $viteModeArguments = if ($WebRuntime -eq 'preview') { @('preview', 'apps/web') } else { @('apps/web') }
  $childArguments = @(
    $viteEntry
  ) + $viteModeArguments + @(
    '--config', 'vite.config.ts', '--host', '127.0.0.1', '--strictPort',
    '--port', [string] $Port
  )
}

$exitCode = [H2SentinelOwnedProcess]::Run(
  $Role,
  $executable,
  [string[]] $childArguments,
  $workingDirectory
)
[Environment]::Exit($exitCode)
