import 'package:flutter/material.dart';
class Clean extends StatelessWidget {
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(32),
    decoration: BoxDecoration(color: Color(0xFF12110F), borderRadius: BorderRadius.circular(8)),
    child: Text('Ship a design system your team actually uses',
        style: TextStyle(fontFamily: 'Sohne', fontSize: 34, letterSpacing: -0.4)),
  );
}
