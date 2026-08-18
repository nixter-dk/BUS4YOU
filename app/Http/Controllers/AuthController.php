<?php
namespace App\Http\Controllers;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rules\Password;

class AuthController extends Controller {
    public function login(Request $request) {
        $credentials=$request->validate(['email'=>'required|email','password'=>'required|string']);
        if (!Auth::attempt($credentials, true)) return response()->json(['message'=>'Forkert e-mail eller adgangskode.'],422);
        $request->session()->regenerate(); return response()->json(['user'=>Auth::user()]);
    }
    public function logout(Request $request) { Auth::logout(); $request->session()->invalidate(); $request->session()->regenerateToken(); return response()->noContent(); }
    public function changePassword(Request $request) {
        abort_unless(in_array($request->user()->role,['admin','customer'],true),403);
        $data=$request->validate([
            'current_password'=>['required','current_password'],
            'password'=>['required','confirmed','different:current_password',Password::min(8)],
        ]);
        $request->user()->update(['password'=>$data['password']]);
        return response()->json(['message'=>'Adgangskoden er ændret.']);
    }
}
