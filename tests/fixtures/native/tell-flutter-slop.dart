import 'package:flutter/material.dart';

class HomePage extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: [Color(0xFF7C3AED), Color(0xFF2563EB)]),
        borderRadius: BorderRadius.circular(16),
        border: Border(left: BorderSide(color: Color(0xFF7C3AED), width: 4)),
      ),
      child: Column(children: [
        Text('Next-generation, world-class platform',
            style: TextStyle(fontFamily: 'Inter', fontSize: 30, letterSpacing: -2.5)),
        Text('caption', style: TextStyle(fontSize: 11, color: Color(0xFF9CA3AF))),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
          child: Text('nested card', textAlign: TextAlign.justify),
        ),
        AnimatedContainer(duration: Duration(milliseconds: 300), curve: Curves.elasticOut),
      ]),
    );
  }
}
