import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-brand-dark">DevComms Media Monitor</h1>
          <p className="mt-2 text-sm text-gray-500">Create your account</p>
        </div>
        <SignUp
          appearance={{
            elements: {
              formButtonPrimary: 'bg-brand-purple hover:bg-brand-dark',
              card: 'shadow-sm border border-gray-200',
            },
          }}
        />
      </div>
    </div>
  );
}
