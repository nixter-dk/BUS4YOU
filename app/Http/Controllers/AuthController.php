<?php
namespace App\Http\Controllers;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class AuthController extends Controller {
    public function login(Request $request) {
        $credentials=$request->validate(['email'=>'required|email','password'=>'required|string']);
        if (!Auth::attempt($credentials, true)) return response()->json(['message'=>'Forkert e-mail eller adgangskode.'],422);
        $request->session()->regenerate(); return response()->json(['user'=>Auth::user()]);
    }
    public function logout(Request $request) { Auth::logout(); $request->session()->invalidate(); $request->session()->regenerateToken(); return response()->noContent(); }
}
